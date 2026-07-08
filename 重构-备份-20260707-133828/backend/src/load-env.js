/**
 * 后端环境分层：
 * - simple: 仅 `.env.generated` + 进程变量
 * - overlay: `.env.generated` + `.env` + 进程变量（兼容旧流程）
 */
import { applyProjectEnvToProcess } from './envLayering.js'

applyProjectEnvToProcess()
