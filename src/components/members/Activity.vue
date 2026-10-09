<script setup lang="ts">
import { ref, onMounted } from "vue";
import { t } from "../../i18n";
import { memberRequest } from "../../lib/member-client";
const props = defineProps<{ collection: string; contentId: string }>();
type State = {
  ok: boolean;
  liked: boolean;
  favorited: boolean;
  likeCount: number;
  favoriteCount: number;
  viewer: unknown;
};
const state = ref<State>();
const busy = ref(false);
const error = ref("");
async function load() {
  try {
    state.value = await memberRequest<State>(
      `activity/state?targetType=${encodeURIComponent(props.collection)}&targetId=${encodeURIComponent(props.contentId)}`,
    );
  } catch {
    error.value = t("member.failed");
  }
}
async function toggle(kind: "like" | "favorite") {
  if (busy.value) return;
  if (!state.value?.viewer) {
    location.assign(
      `/login/?returnTo=${encodeURIComponent(location.pathname)}`,
    );
    return;
  }
  busy.value = true;
  error.value = "";
  try {
    const active = kind === "like" ? state.value.liked : state.value.favorited;
    const result = await memberRequest<{ ok: boolean; reason?: string }>(
      "activity/toggle",
      {
        kind,
        action: active ? "remove" : "add",
        targetType: props.collection,
        targetId: props.contentId,
      },
    );
    if (!result.ok) {
      if (result.reason === "unauthorized") location.assign("/login/");
      throw new Error("activity_failed");
    }
    await load();
  } catch {
    error.value = t("member.failed");
  } finally {
    busy.value = false;
  }
}
onMounted(load);
</script>
<template>
  <div class="activity">
    <template v-if="state?.ok">
      <button
        :disabled="busy"
        :aria-pressed="state.liked"
        @click="toggle('like')"
      >
        ♡ {{ t("activity.like") }} {{ state.likeCount }}
      </button>
      <button
        v-if="collection !== 'comment'"
        :disabled="busy"
        :aria-pressed="state.favorited"
        @click="toggle('favorite')"
      >
        ☆ {{ t("activity.favorite") }} {{ state.favoriteCount }}
      </button>
    </template>
    <span v-if="error" role="alert">{{ error }}</span>
  </div>
</template>
<style scoped>
.activity {
  min-height: 36px;
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  margin: 18px 0;
}
button {
  background: var(--accent-soft);
  color: var(--accent);
  padding: 8px 16px;
  border: 1px solid transparent;
  border-radius: 20px;
}
button[aria-pressed="true"] {
  border-color: var(--accent);
}
button:disabled {
  opacity: 0.5;
}
</style>
