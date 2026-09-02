import { formatCode, parseCode } from "@/lib/ids";

export const AGENT_CODE_PREFIX = "AGT";
export const AGENT_STATUSES = ["active", "disabled"] as const;
export type AgentStatus = (typeof AGENT_STATUSES)[number];

export function isAgentStatus(v: unknown): v is AgentStatus {
  return typeof v === "string" && (AGENT_STATUSES as readonly string[]).includes(v);
}

export interface AgentInput {
  name: string;
  nameKana: string;
  companyName: string;
  contactName: string;
  email: string;
  /** Commission rate in percent, 0–100 with up to 2 decimals. */
  feeRate: number;
  status: AgentStatus;
}

export interface AgentView extends AgentInput {
  id: string;
  agentCode: string;
  createdAt: Date;
  updatedAt: Date;
}

export const formatAgentCode = (n: number) => formatCode(AGENT_CODE_PREFIX, n);
export const parseAgentCode = (code: string) => parseCode(AGENT_CODE_PREFIX, code);
