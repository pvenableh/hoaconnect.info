// types/vercel.ts

export interface VercelDomainResponse {
  name: string;
  apexName?: string;
  projectId?: string;
  redirect?: string;
  redirectStatusCode?: number;
  gitBranch?: string | null;
  updatedAt?: number;
  createdAt?: number;
  verified?: boolean;
  verification?: Array<{
    type: string;
    domain: string;
    value: string;
    reason: string;
  }>;
}

export interface VercelDomainConfig {
  configuredBy?: string;
  nameservers?: string[];
  serviceType?: string;
  cnames?: string[];
  aValues?: string[];
  conflicts?: any[];
  conflictingDnsRecords?: any[];
  acceptedChallenges?: string[];
  misconfigured?: boolean;
}
