<template>
  <div class="sponsor-card ui-card ui-card-hover mc-selectable">
    <div class="card-content">
      <div class="header">
        <div class="info">
          <h3 class="name">{{ sponsor.name }}</h3>
          <span class="date" v-if="sponsor.date">{{ sponsor.date }}</span>
        </div>
        <div class="amount-badge">
          {{ sponsor.amount }}
        </div>
      </div>
      <div class="message">
        "{{ sponsor.message }}"
      </div>
    </div>
    <div class="ripple-overlay"></div>
  </div>
</template>

<script setup lang="ts">
import type { Sponsor } from '@/shared/config/sponsors';

defineProps<{
  sponsor: Sponsor;
}>();
</script>

<style scoped lang="scss">
.sponsor-card {
  position: relative;
  padding: 16px;
  border: 2px solid #1f2a1c;
  border-radius: var(--radius-2);
  background: linear-gradient(180deg, #3c5f33 0%, #2f4b28 100%);
  box-shadow:
    inset 2px 2px 0 #7aa36d,
    inset -2px -2px 0 #23391d,
    4px 4px 0 rgba(0, 0, 0, 0.35);
  transition: transform 0.12s steps(2, end), box-shadow 0.12s steps(2, end), filter 0.12s steps(2, end);
  overflow: hidden;
  cursor: pointer;

  &::before {
    content: '';
    position: absolute;
    inset: 0;
    background-image: linear-gradient(
      45deg,
      rgba(255, 255, 255, 0.04) 25%,
      transparent 25%,
      transparent 50%,
      rgba(255, 255, 255, 0.04) 50%,
      rgba(255, 255, 255, 0.04) 75%,
      transparent 75%,
      transparent
    );
    background-size: 8px 8px;
    pointer-events: none;
  }

  &:hover {
    transform: translate(-2px, -2px);
    box-shadow:
      inset 2px 2px 0 #86b578,
      inset -2px -2px 0 #1f321a,
      7px 7px 0 rgba(0, 0, 0, 0.4);
    filter: saturate(1.08);
  }

  &:active {
    transform: translate(1px, 1px);
    box-shadow:
      inset 1px 1px 0 #6d9460,
      inset -1px -1px 0 #23391d,
      3px 3px 0 rgba(0, 0, 0, 0.35);
  }
}

.card-content {
  position: relative;
  z-index: 1;
}

.header {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding-bottom: 10px;
  margin-bottom: 10px;
  border-bottom: 2px dashed rgba(234, 249, 222, 0.28);
}

.info {
  flex: 1;
  min-width: 0;
}

.name {
  margin: 0;
  color: #efffdf;
  font-size: 1rem;
  line-height: 1.35;
  letter-spacing: 0.5px;
  font-family: 'Minecraft', 'Press Start 2P', 'Courier New', monospace;
  text-shadow: 1px 1px 0 rgba(0, 0, 0, 0.38);
  word-break: break-word;
}

.date {
  display: inline-block;
  margin-top: 4px;
  color: #c6dfb2;
  font-size: 0.74rem;
  letter-spacing: 0.4px;
}

.amount-badge {
  flex-shrink: 0;
  padding: 5px 10px;
  color: #fff7ca;
  background: linear-gradient(180deg, #aa8a2d 0%, #7f651f 100%);
  border: 2px solid #3c2f12;
  box-shadow: inset 1px 1px 0 #c8a84a, inset -1px -1px 0 #5c4814;
  font-size: 0.86rem;
  font-weight: 700;
  letter-spacing: 0.4px;
  white-space: nowrap;
}

.message {
  color: #e4f4d4;
  font-size: 0.93rem;
  line-height: 1.7;
  letter-spacing: 0.2px;
  text-shadow: 1px 1px 0 rgba(0, 0, 0, 0.22);
}
</style>
