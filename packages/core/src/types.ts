/**
 * Lynx — Shared Types
 * Central type definitions used across all packages.
 */

// ─── Severity ────────────────────────────────────────────────────────────────

export type Severity = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'FATAL';

export const SEVERITY_LEVEL: Record<Severity, number> = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
  FATAL: 4,
};

// ─── Event Layers ─────────────────────────────────────────────────────────────

export type EventLayer =
  | 'UI'
  | 'API'
  | 'SERVICE'
  | 'DB'
  | 'CACHE'
  | 'QUEUE'
  | 'AUTH'
  | 'INFRA'
  | 'EXTERNAL'
  | 'TEST'
  | 'SECURITY'
  | 'SYSTEM'
  | string; // extensible — users can define custom layers

// ─── Telemetry Event ──────────────────────────────────────────────────────────

export interface LynxEvent {
  id?: string;
  timestamp: string;           // ISO 8601
  severity: Severity;
  layer: EventLayer;
  message: string;
  fingerprint?: string;        // generated server-side if not provided
  projectId?: string;
  userId?: string;
  userEmail?: string;
  userName?: string;
  sessionId?: string;
  version?: string;            // app version
  environment?: UserEnvironment;
  stackTrace?: string;
  breadcrumbs?: Breadcrumb[];
  extra?: Record<string, unknown>;
  // OpenTelemetry compatibility
  traceId?: string;
  spanId?: string;
  attributes?: Record<string, string | number | boolean>;
  // Expiry (set by server based on severity)
  expiresAt?: string | null;
}

// ─── Error Tracker (dedup) ────────────────────────────────────────────────────

export interface ErrorTracker {
  id?: string;
  fingerprint: string;         // LAYER::ErrorName::NormalizedMessage
  errorName: string;
  layer: EventLayer;
  severity: Severity;
  projectId?: string;
  sampleMessage: string;
  occurrences: number;
  affectedUserCount: number;
  affectedUsers: AffectedUser[];
  affectedVersions: string[];
  firstOccurrence: string;
  lastOccurrence: string;
  resolved: boolean;
  resolvedBy?: string;
  resolvedAt?: string;
  notes?: string;
  regressed: boolean;
  regressionCount: number;
  expiresAt?: string | null;
}

export interface AffectedUser {
  userId?: string;
  userEmail?: string;
  userName?: string;
  count: number;
  lastSeen: string;
  environment?: UserEnvironment;
}

// ─── User Environment ─────────────────────────────────────────────────────────

export interface UserEnvironment {
  os?: 'win' | 'mac' | 'linux' | 'cros' | 'android' | 'ios' | string;
  arch?: string;
  browser?: { name: string; version: string };
  runtime?: 'node' | 'deno' | 'bun' | 'browser' | string;
  runtimeVersion?: string;
  deviceMemory?: number;       // GB
  hardwareConcurrency?: number;
  screenWidth?: number;
  screenHeight?: number;
  language?: string;
  onLine?: boolean;
  connection?: {
    effectiveType?: '2g' | '3g' | '4g' | 'slow-2g';
    rtt?: number;
    downlink?: number;
  };
}

// ─── Breadcrumb ───────────────────────────────────────────────────────────────

export interface Breadcrumb {
  timestamp: string;
  type: 'navigation' | 'http' | 'click' | 'error' | 'log' | 'user' | string;
  message: string;
  data?: Record<string, unknown>;
}

// ─── HITL (Human-in-the-Loop) ─────────────────────────────────────────────────

export type HITLAction =
  | 'CODE_FIX'
  | 'CODE_REVIEW'
  | 'SECURITY_BLOCK'
  | 'INFRA_CHANGE'
  | 'DEPENDENCY_UPDATE'
  | 'CONFIG_CHANGE'
  | 'DEPLOY'
  | 'ALERT_SUPPRESS'
  | string;

export type HITLStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'MODIFIED' | 'EXPIRED';

export interface HITLRequest {
  id: string;
  createdAt: string;
  expiresAt?: string;
  status: HITLStatus;
  action: HITLAction;
  title: string;
  description: string;
  // The agent's chain-of-thought before proposing
  thinking?: string;
  // What Lynx proposes to do
  proposal: {
    type: 'diff' | 'command' | 'config' | 'plan' | 'json';
    content: string;           // diff text, command string, JSON, markdown plan
    files?: string[];          // affected file paths
    reversible: boolean;
    riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  };
  // Context for the human reviewer
  context: {
    triggeredBy: string;       // 'test-engine' | 'guard' | 'brain' | 'monitor'
    projectId?: string;
    relatedEventId?: string;
    relatedFingerprint?: string;
  };
  // Set on approval
  approvedBy?: string;
  approvedAt?: string;
  modifiedProposal?: string;   // if reviewer modified the proposal before approving
  rejectedBy?: string;
  rejectedAt?: string;
  rejectionReason?: string;
}

// ─── Project Map ──────────────────────────────────────────────────────────────

export interface ProjectMap {
  id: string;
  path: string;
  name: string;
  lastScanned: string;
  languages: string[];
  frameworks: string[];
  services: ServiceInfo[];
  testFrameworks: string[];
  buildCommand?: string;
  testCommand?: string;
  hasDocker: boolean;
  hasKubernetes: boolean;
  packageFiles: string[];      // package.json, requirements.txt, go.mod, etc.
  docFiles: string[];          // README.md, docs/, etc.
  configFiles: string[];       // .env.example, docker-compose.yml, etc.
  layers: string[];            // detected architectural layers
}

export interface ServiceInfo {
  name: string;
  type: 'frontend' | 'backend' | 'worker' | 'database' | 'cache' | 'infra' | string;
  path: string;
  port?: number;
  healthEndpoint?: string;
}

// ─── Scan Results ─────────────────────────────────────────────────────────────

export interface ScanResult {
  id: string;
  type: 'SAST' | 'CVE' | 'SECRET' | 'IAC' | 'RUNTIME' | 'LICENSE';
  tool: 'semgrep' | 'trivy' | 'falco' | 'custom';
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';
  title: string;
  description: string;
  file?: string;
  line?: number;
  cve?: string;
  cvss?: number;
  fix?: string;
  projectId?: string;
  scannedAt: string;
  dismissed: boolean;
}

// ─── Test Results ─────────────────────────────────────────────────────────────

export type TestStatus = 'PASS' | 'FAIL' | 'SKIP' | 'ERROR';

export interface TestResult {
  id: string;
  projectId?: string;
  runAt: string;
  framework: string;
  duration: number;            // ms
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  coverage?: number;           // 0–100
  suites: TestSuite[];
  failures: TestFailure[];
}

export interface TestSuite {
  name: string;
  status: TestStatus;
  duration: number;
  tests: TestCase[];
}

export interface TestCase {
  name: string;
  status: TestStatus;
  duration: number;
  error?: string;
  file?: string;
  line?: number;
}

export interface TestFailure {
  test: string;
  file?: string;
  error: string;
  stackTrace?: string;
  // Populated after Brain analysis
  analysis?: {
    classification: 'code_bug' | 'flaky_test' | 'env_issue' | 'unknown';
    thinking?: string;
    proposedFix?: string;
    confidence?: number;
    hitlRequestId?: string;
  };
}

// ─── Competitor / Market Intelligence ─────────────────────────────────────────

export interface CompetitorReport {
  id: string;
  generatedAt: string;
  competitors: CompetitorEntry[];
  trends: TrendEntry[];
  featureGaps: string[];
  opportunities: string[];
  lynxSuggestions: string[];
}

export interface CompetitorEntry {
  name: string;
  url?: string;
  stars?: number;
  weeklyDownloads?: number;
  lastRelease?: string;
  strengths: string[];
  weaknesses: string[];
  pricingModel?: string;
}

export interface TrendEntry {
  topic: string;
  direction: 'rising' | 'falling' | 'stable';
  evidence: string;
  relevance: 'HIGH' | 'MEDIUM' | 'LOW';
}

// ─── Dashboard Aggregate ──────────────────────────────────────────────────────

export interface DashboardSummary {
  status: 'healthy' | 'warning' | 'critical';
  lastUpdated: string;
  monitor: {
    last24h: { total: number; errors: number; fatals: number };
    last7d: { total: number };
    unresolvedErrors: number;
    activeUsers24h: number;
    topErrors: ErrorTracker[];
  };
  tests: {
    lastRun?: string;
    status: TestStatus | null;
    coverage?: number;
    failureCount: number;
    pendingFixes: number;
  };
  security: {
    critical: number;
    high: number;
    medium: number;
    pendingApproval: number;
  };
  hitl: {
    pendingCount: number;
    oldestPending?: string;
  };
  brain: {
    proactiveInsights: string[];
  };
}

// ─── Notification ─────────────────────────────────────────────────────────────

export type NotificationChannel = 'slack' | 'discord' | 'email' | 'webhook' | 'dashboard';

export interface NotificationPayload {
  channel?: NotificationChannel;
  title: string;
  body: string;
  severity: 'info' | 'warning' | 'error' | 'critical';
  fields?: Array<{ name: string; value: string; inline?: boolean }>;
  actions?: Array<{ label: string; url: string; style?: 'primary' | 'danger' }>;
  footer?: string;
}
