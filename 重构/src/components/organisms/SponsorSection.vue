<template>
  <section class="sponsor-section">
    <div class="container">
      <p class="subtitle">{{ config.subtitle }}</p>

      <div class="sponsor-grid">
        <SponsorCard
          v-for="(sponsor, index) in sponsors"
          :key="index"
          :sponsor="sponsor"
        />
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { sponsors, sponsorConfig } from '@/shared/config/sponsors';
import SponsorCard from '@/components/molecules/SponsorCard.vue';

const config = sponsorConfig;
</script>

<style scoped lang="scss">
.sponsor-section {
  position: relative;
  padding: 48px 0 64px;
  background: transparent;
}

.container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 24px;
}

.subtitle {
  margin: 0 0 24px;
  color: rgba(235, 241, 255, 0.72);
  font-size: 0.96rem;
  line-height: 1.7;
  text-align: center;
}

.sponsor-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(290px, 1fr));
  gap: 20px;
}

@media (max-width: 768px) {
  .sponsor-section {
    padding: 40px 0 56px;
  }

  .container {
    padding: 0 16px;
  }

  .subtitle {
    margin-bottom: 20px;
    font-size: 0.92rem;
  }

  .sponsor-grid {
    grid-template-columns: 1fr;
    gap: 16px;
  }
}
</style>
