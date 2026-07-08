<template>
  <div class="home-container" ref="homeContainer">
    <HeroSection />

    <section class="home-flow page-shell" aria-label="首页内容">
      <div v-if="showTeamSkeleton" class="section-skeleton" aria-hidden="true">
        <SkeletonLoader height="240px" border-radius="24px" />
      </div>

      <TeamCarousel
        v-if="readyToLoadLowerSections"
        v-float-up="{ delay: 80, rootMargin: '0px 0px -6% 0px' }"
        class="team-section"
      />

      <div ref="sponsorSentinel" class="sponsor-sentinel" aria-hidden="true"></div>

      <div v-if="showSponsorSkeleton" class="section-skeleton" aria-hidden="true">
        <SkeletonLoader height="180px" border-radius="24px" />
      </div>

      <Sponsor
        v-if="readyToLoadSponsor"
        v-float-up="{ delay: 120, rootMargin: '0px 0px -6% 0px' }"
      />
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, defineAsyncComponent, onMounted, onUnmounted } from 'vue';
import HeroSection from '@/components/organisms/HeroSection.vue';
import SkeletonLoader from '@/components/atoms/SkeletonLoader.vue';

const TeamCarousel = defineAsyncComponent({
  loader: () => import('@/components/organisms/TeamCarousel.vue'),
  loadingComponent: SkeletonLoader,
  delay: 0,
  timeout: 10000,
});

const Sponsor = defineAsyncComponent({
  loader: () => import('@/components/organisms/Sponsor/Sponsor.vue'),
  loadingComponent: SkeletonLoader,
  delay: 0,
});

const readyToLoadLowerSections = ref(false);
const readyToLoadSponsor = ref(false);
const homeContainer = ref<HTMLElement | null>(null);
const sponsorSentinel = ref<HTMLElement | null>(null);
let sponsorObserver: IntersectionObserver | null = null;
let pageObserver: IntersectionObserver | null = null;
let lowerSectionTimer: number | null = null;
let sponsorFallbackTimer: number | null = null;

const showTeamSkeleton = computed(() => !readyToLoadLowerSections.value);
const showSponsorSkeleton = computed(() => readyToLoadLowerSections.value && !readyToLoadSponsor.value);

onMounted(() => {
  if (typeof IntersectionObserver !== 'undefined') {
    pageObserver = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) {
        lowerSectionTimer = window.setTimeout(() => {
          readyToLoadLowerSections.value = true;
        }, 120);
        pageObserver?.disconnect();
      }
    }, { rootMargin: '120px' });

    if (homeContainer.value) {
      pageObserver.observe(homeContainer.value);
    }

    sponsorObserver = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting && !readyToLoadSponsor.value) {
        readyToLoadSponsor.value = true;
        sponsorObserver?.disconnect();
      }
    }, {
      rootMargin: '420px',
      threshold: 0,
    });

    if (sponsorSentinel.value) {
      sponsorObserver.observe(sponsorSentinel.value);
    }
  } else {
    lowerSectionTimer = window.setTimeout(() => {
      readyToLoadLowerSections.value = true;
      sponsorFallbackTimer = window.setTimeout(() => {
        readyToLoadSponsor.value = true;
      }, 500);
    }, 300);
  }
});

onUnmounted(() => {
  pageObserver?.disconnect();
  sponsorObserver?.disconnect();
  if (lowerSectionTimer) window.clearTimeout(lowerSectionTimer);
  if (sponsorFallbackTimer) window.clearTimeout(sponsorFallbackTimer);
});
</script>

<style lang="scss" scoped>
.home-container {
  width: 100%;
  max-width: 100vw;
  position: relative;
  z-index: 1;
  overflow-x: hidden;
  box-sizing: border-box;
}

.home-flow {
  margin-top: -18px;
  padding-top: clamp(0.45rem, 1.6vw, 0.9rem);
  display: grid;
  gap: 0.72rem;
  position: relative;
  z-index: 2;
}

.section-skeleton {
  display: grid;
}

.team-section {
  margin-top: 0;
  width: 100%;
  max-width: 100vw;
  overflow-x: hidden;
}

.sponsor-sentinel {
  width: 100%;
  height: 1px;
  pointer-events: none;
  opacity: 0;
}

@keyframes marquee-slide {
  0% {
    transform: translateX(0);
  }
  100% {
    transform: translateX(-50%);
  }
}

@media (max-width: 768px) {
  .home-container {
    padding-bottom: 72px;
  }

  .home-flow {
    margin-top: -12px;
    gap: 0.8rem;
    padding-top: 0.8rem;
  }

}
</style>
