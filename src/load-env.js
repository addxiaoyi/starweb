import { applyProjectEnvToProcess } from './envLayering.js'

applyProjectEnvToProcess({ mode: process.env.STARMC_ENV_LAYER || 'simple' })
