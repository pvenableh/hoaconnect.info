// types/domain.ts

export interface DnsRecord {
  type: string;
  name: string;
  value: string;
}

export interface DnsInstructions {
  type: string;
  primary?: DnsRecord[];
  www?: DnsRecord[];
  records?: DnsRecord[];
  alternative?: {
    type: string;
    name: string;
    value: string;
    note: string;
  };
}

export interface AddDomainResponse {
  success: boolean;
  domain: string;
  domainType: "apex" | "subdomain" | "www";
  dnsInstructions: DnsInstructions;
}

export interface VerifyDomainResponse {
  verified: boolean;
  domain: string;
  status: any;
}
