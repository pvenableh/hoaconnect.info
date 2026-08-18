import { describe, it, expect } from "vitest";
import {
  classifyDomain,
  hostCandidates,
  isLocalHost,
  isPlatformHost,
  normalizeHost,
  pickOrgForHost,
  verificationRecordName,
} from "#core/shared/domains/host";

describe("normalizeHost", () => {
  it("strips protocol, path, port, trailing dot, and lowercases", () => {
    expect(normalizeHost("HTTPS://Example.COM:3000/foo/bar")).toBe("example.com");
    expect(normalizeHost("example.com.")).toBe("example.com");
    expect(normalizeHost("  http://example.com  ")).toBe("example.com");
  });

  it("returns empty for nullish input", () => {
    expect(normalizeHost(undefined)).toBe("");
    expect(normalizeHost(null)).toBe("");
    expect(normalizeHost("")).toBe("");
  });

  it("keeps the www label — pairing is hostCandidates' job, not normalization's", () => {
    expect(normalizeHost("www.example.com")).toBe("www.example.com");
  });
});

describe("isLocalHost", () => {
  it("recognizes loopback and .localhost", () => {
    expect(isLocalHost("localhost")).toBe(true);
    expect(isLocalHost("localhost:3000")).toBe(true);
    expect(isLocalHost("127.0.0.1")).toBe(true);
    expect(isLocalHost("app.localhost")).toBe(true);
  });

  it("rejects real domains", () => {
    expect(isLocalHost("example.com")).toBe(false);
    // A domain merely ENDING in the word is not loopback.
    expect(isLocalHost("notlocalhost.com")).toBe(false);
  });
});

describe("isPlatformHost", () => {
  const main = "app.hoaconnect.info";

  it("treats the main domain, its www form, and subdomains as ours", () => {
    expect(isPlatformHost(main, main)).toBe(true);
    expect(isPlatformHost(`www.${main}`, main)).toBe(true);
    expect(isPlatformHost(`preview.${main}`, main)).toBe(true);
  });

  it("treats a customer domain as not ours", () => {
    expect(isPlatformHost("605lincolnroad.com", main)).toBe(false);
    expect(isPlatformHost("www.605lincolnroad.com", main)).toBe(false);
  });

  it("does not match a lookalike suffix", () => {
    // "evilapp.hoaconnect.info" ends with ".hoaconnect.info" but NOT with
    // ".app.hoaconnect.info", so it must not pass as ours.
    expect(isPlatformHost("evil-app.hoaconnect.info", main)).toBe(false);
    // And a domain that merely ends in the main domain's TEXT is not a subdomain.
    expect(isPlatformHost("notapp.hoaconnect.info", main)).toBe(false);
  });

  it("treats localhost and an empty host as ours", () => {
    expect(isPlatformHost("localhost:3000", main)).toBe(true);
    expect(isPlatformHost("", main)).toBe(true);
    expect(isPlatformHost(undefined, main)).toBe(true);
  });

  it("with no configured main domain, nothing but local is ours", () => {
    expect(isPlatformHost("example.com", "")).toBe(false);
    expect(isPlatformHost("localhost", "")).toBe(true);
  });
});

describe("hostCandidates", () => {
  it("pairs the bare and www forms, deduped", () => {
    expect(hostCandidates("example.com").sort()).toEqual(["example.com", "www.example.com"]);
    expect(hostCandidates("www.example.com").sort()).toEqual(["example.com", "www.example.com"]);
  });

  it("includes a subdomain as given plus its www pairing", () => {
    expect(hostCandidates("portal.example.com")).toContain("portal.example.com");
  });

  it("is empty for no host", () => {
    expect(hostCandidates("")).toEqual([]);
    expect(hostCandidates(null)).toEqual([]);
  });
});

describe("classifyDomain", () => {
  it("calls two labels apex and three-plus a subdomain", () => {
    expect(classifyDomain("example.com")).toBe("apex");
    expect(classifyDomain("portal.example.com")).toBe("subdomain");
    expect(classifyDomain("https://portal.example.com/x")).toBe("subdomain");
  });
});

describe("verificationRecordName", () => {
  it("prefixes the normalized domain", () => {
    expect(verificationRecordName("Example.COM")).toBe("_hoaconnect.example.com");
  });
});

describe("pickOrgForHost", () => {
  const bare = { id: "1", slug: "bare", custom_domain: "example.com" };
  const www = { id: "2", slug: "www-org", custom_domain: "www.example.com" };

  it("prefers an exact host match over a www variant", () => {
    expect(pickOrgForHost("example.com", [www, bare])?.id).toBe("1");
    expect(pickOrgForHost("www.example.com", [bare, www])?.id).toBe("2");
  });

  it("falls back to the www variant when there is no exact match", () => {
    expect(pickOrgForHost("www.example.com", [bare])?.id).toBe("1");
    expect(pickOrgForHost("example.com", [www])?.id).toBe("2");
  });

  it("ignores rows for a different domain", () => {
    expect(pickOrgForHost("example.com", [{ id: "9", slug: "other", custom_domain: "other.com" }])).toBeNull();
  });

  it("is null for an empty host or empty result set", () => {
    expect(pickOrgForHost("", [bare])).toBeNull();
    expect(pickOrgForHost("example.com", [])).toBeNull();
  });

  it("tolerates rows with no custom_domain", () => {
    expect(pickOrgForHost("example.com", [{ id: "3", slug: "none", custom_domain: null }, bare])?.id).toBe("1");
  });
});
