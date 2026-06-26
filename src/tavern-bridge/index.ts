// Tavern Bridge · 桥协议+实现+酒馆 AI 适配器 索引
export { getBridge, _resetBridgeForTest } from './bridge';
export { createBridgeAi } from './bridge-ai';
export type {
  TavernBridge, AppToTavernMessage, TavernToAppMessage,
  GeneratePrompt, GenerateResponse,
} from './protocol';
