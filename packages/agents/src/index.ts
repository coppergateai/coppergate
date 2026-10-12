export type {
  AgentEvent,
  AgentEventKind,
  AgentRunInput,
  CodingAgent,
  FakeCompletionPayload,
} from "./types.js";
export {
  AgentPolicyError,
  FakeCodingAgent,
  buildFakeCompletion,
  isFakeCompletionPayload,
} from "./fake.js";
export {
  runFakeValidation,
  type FakeValidationInput,
  type FakeValidationReport,
} from "./validation.js";
export {
  OpenAiCompatibleCodingAgent,
  type OpenAiCompatibleConfig,
} from "./openai-compatible.js";
export {
  createCodingAgent,
  type CreateCodingAgentOptions,
} from "./create-agent.js";
export {
  CONTENDER_STRATEGIES,
  isContenderStrategy,
  strategyGuidance,
  strategySpendFraction,
  type ContenderStrategy,
} from "./strategy.js";
