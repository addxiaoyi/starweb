import type { RouteRecordRaw } from 'vue-router'

const m = (title: string, section: 'core' | 'explore' | 'operation' | 'account' | 'developer', extra: Record<string, unknown> = {}) => ({ title, section, ...extra })

export const operationRoutes: RouteRecordRaw[] = [
  { path: '/ztjk', name: 'ztjk', component: () => import('@/views/ZtjkView.vue'), meta: m('服务器状态', 'operation') },
  { path: '/skin/submit', name: 'skin-submit', component: () => import('@/views/SubmissionCenterView.vue'), meta: m('投稿中心', 'operation', { requiresAuth: true }) },
  { path: '/skin/admin', name: 'skin-admin', component: () => import('@/views/SkinAdminView.vue'), meta: m('皮肤库管理', 'operation', { requiresAdmin: true }) },
  { path: '/admin/users', name: 'user-admin', component: () => import('@/views/UserAdminView.vue'), meta: m('用户管理', 'operation', { requiresAdmin: true }) },
  { path: '/skin/review', name: 'skin-review', component: () => import('@/views/ReviewCenterView.vue'), meta: m('投稿审核', 'operation', { requiresReviewer: true }) },
  { path: '/skin/reports', name: 'skin-reports', component: () => import('@/views/ReportAdminView.vue'), meta: m('举报管理', 'operation', { requiresAdmin: true }) },
  { path: '/diagnostics', name: 'diagnostics', component: () => import('@/views/McResetEventsAdminView.vue'), meta: m('系统诊断', 'operation', { requiresAdmin: true }) },
  { path: '/diagnostics/ops', name: 'ops-admin', component: () => import('@/views/OpsTasksAdminView.vue'), meta: m('任务与死信', 'operation', { requiresAdmin: true }) },
  { path: '/diagnostics/audit', name: 'audit-admin', component: () => import('@/views/AuditLogsAdminView.vue'), meta: m('审计日志', 'operation', { requiresAdmin: true }) },
  { path: '/diagnostics/telemetry', name: 'telemetry-admin', component: () => import('@/views/TelemetryAdminView.vue'), meta: m('访问遥测', 'operation', { requiresAdmin: true }) },
  { path: '/security', name: 'security', component: () => import('@/views/SecurityCenterView.vue'), meta: m('安全中心', 'operation') }
]
