<script setup lang="ts">
import { onMounted, ref } from "vue";
import { t } from "../../i18n";
import { memberRequest } from "../../lib/member-client";
import type { MemberOverview } from "../../plugins/members/index";
const overview = ref<MemberOverview>();
const displayName = ref("");
const avatarUrl = ref("");
const bio = ref("");
const feedback = ref("");
const busy = ref(false);
const login = () => location.assign("/login/?returnTo=/member/");
async function load() {
  try {
    const value = await memberRequest<MemberOverview & { ok: boolean }>(
      "member/overview",
    );
    if (!value.ok) return login();
    overview.value = value;
    displayName.value = value.member.displayName;
    avatarUrl.value = value.member.avatarUrl;
    bio.value = value.member.bio;
  } catch {
    feedback.value = t("member.failed");
  }
}
async function save() {
  busy.value = true;
  try {
    const value = await memberRequest<{ ok: boolean }>("member/profile", {
      displayName: displayName.value,
      avatarUrl: avatarUrl.value,
      bio: bio.value,
    });
    feedback.value = t(value.ok ? "member.saved" : "member.invalid");
  } catch {
    feedback.value = t("member.failed");
  } finally {
    busy.value = false;
  }
}
async function more(kind: "favorites" | "comments") {
  if (!overview.value || busy.value) return;
  const cursor =
    overview.value[kind === "favorites" ? "favoritesCursor" : "commentsCursor"];
  if (!cursor) return;
  busy.value = true;
  try {
    const result = await memberRequest<MemberOverview & { ok: boolean }>(
      `member/overview?${kind}Cursor=${encodeURIComponent(cursor)}`,
    );
    if (!result.ok) return login();
    const seen = new Set(
      overview.value[kind].map((item) =>
        kind === "favorites"
          ? (item as MemberOverview["favorites"][number]).targetId
          : (item as MemberOverview["comments"][number]).id,
      ),
    );
    // Each cursor is advanced independently; the other list stays where the reader left it.
    if (kind === "favorites") {
      overview.value.favorites.push(
        ...result.favorites.filter((item) => !seen.has(item.targetId)),
      );
      overview.value.favoritesCursor = result.favoritesCursor;
    } else {
      overview.value.comments.push(
        ...result.comments.filter((item) => !seen.has(item.id)),
      );
      overview.value.commentsCursor = result.commentsCursor;
    }
  } catch {
    feedback.value = t("member.failed");
  } finally {
    busy.value = false;
  }
}
async function logout() {
  busy.value = true;
  try {
    await memberRequest("auth/logout", {});
    location.assign("/login/");
  } catch {
    feedback.value = t("member.failed");
    busy.value = false;
  }
}
onMounted(load);
</script>
<template>
  <section class="member-panel panel">
    <p role="status" aria-live="polite">{{ feedback }}</p>
    <template v-if="overview">
      <form @submit.prevent="save" class="member-form">
        <label
          >{{ t("member.name")
          }}<input
            v-model="displayName"
            required
            maxlength="40"
            autocomplete="nickname"
        /></label>
        <label
          >{{ t("member.avatar")
          }}<input
            v-model="avatarUrl"
            type="url"
            maxlength="2048"
            placeholder="https://"
        /></label>
        <label
          >{{ t("member.bio")
          }}<textarea v-model="bio" maxlength="200" rows="3" />
        </label>
        <button :disabled="busy">{{ t("member.save") }}</button>
      </form>
      <button type="button" :disabled="busy" @click="logout">
        {{ t("member.logout") }}
      </button>
      <p>
        {{ t("activity.like") }} {{ overview.counts.likes }} ·
        {{ t("activity.favorite") }} {{ overview.counts.favorites }}
      </p>
      <h2>{{ t("member.favorites") }}</h2>
      <p v-if="!overview.favorites.length">{{ t("member.empty") }}</p>
      <ul>
        <li
          v-for="item in overview.favorites"
          :key="`${item.targetType}:${item.targetId}`"
          class="member-favorite"
        >
          <a :href="item.path">{{ item.title }}</a>
        </li>
      </ul>
      <button
        v-if="overview.favoritesCursor"
        :disabled="busy"
        @click="more('favorites')"
      >
        {{ t("member.moreFavorites") }}
      </button>
      <h2>{{ t("member.comments") }}</h2>
      <p v-if="!overview.comments.length">{{ t("member.empty") }}</p>
      <ul>
        <li
          v-for="item in overview.comments"
          :key="item.id"
          class="member-comment"
        >
          <a :href="item.targetPath">{{ item.targetTitle }}</a>
          <p>{{ item.body }}</p>
          <small>{{ item.status }}</small>
        </li>
      </ul>
      <button
        v-if="overview.commentsCursor"
        :disabled="busy"
        @click="more('comments')"
      >
        {{ t("member.moreComments") }}
      </button>
    </template>
  </section>
</template>
<style scoped>
.member-panel {
  margin: 24px auto;
  padding: 28px;
  max-width: 900px;
}
.member-form {
  display: grid;
  gap: 16px;
  max-width: 600px;
}
label {
  display: grid;
  gap: 8px;
}
input,
textarea {
  width: 100%;
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 10px;
  color: var(--text);
  background: var(--bg);
}
button {
  padding: 10px 18px;
  border-radius: 10px;
  background: var(--accent-soft);
  color: var(--accent);
  margin: 8px 8px 8px 0;
}
button:disabled {
  opacity: 0.5;
}
ul {
  padding: 0;
  list-style: none;
}
li {
  border-bottom: 1px solid var(--line);
  padding: 10px 0;
  overflow-wrap: anywhere;
}
</style>
