/**
 * @lynx/core — Public API
 */

// Types
export * from './types.js';

// Fingerprinting
export {
  generateFingerprint,
  normalizeMessage,
  extractErrorName,
  fingerprintsAreSimilar,
} from './fingerprint.js';

// HITL
export {
  requestApproval,
  resolveRequest,
  buildHITLNotification,
  setHITLEventEmitter,
  setHITLStore,
  type HITLStore,
  type HITLEventEmitter,
  type CreateHITLOptions,
} from './hitl.js';

// Notifier
export {
  notifier,
  SlackAdapter,
  DiscordAdapter,
  EmailAdapter,
  WebhookAdapter,
  type NotificationAdapter,
  type EmailConfig,
} from './notifier/index.js';

// LLM Router
export {
  chat,
  configureLLM,
  recommendLocalModel,
  type LLMConfig,
  type LLMMessage,
  type LLMResponse,
  type LLMRequestOptions,
  type LLMTier,
  type ModelRecommendation,
} from './llm-router.js';

// Breadcrumbs
export { BreadcrumbTrail, globalTrail } from './breadcrumbs.js';

// Colors
export { c, brand, severityColor, severityIcon, drawBox } from './colors.js';

// LLM Router — orchestrate/execute tier exports
export {
  orchestrate,
  execute,
} from './llm-router.js';

// Model Bundles
export {
  recommendBundle,
  canRunParallel,
  getBundleTags,
  bundleMaxRam,
  bundleTotalRam,
  BUNDLES,
  MODELS,
  type ModelRole,
  type ModelSpec,
  type ModelBundle,
  type UseCaseProfile,
} from './model-bundles.js';

// LLM Mesh
export {
  LLMesh,
  initMesh,
  getMesh,
  addToSession,
  getSession,
  clearSession,
  type TaskType,
  type MeshMessage,
  type MeshResponse,
} from './llm-mesh.js';
