/**
 * "Is this URL somewhere on the public internet?" — for routes that fetch a URL
 * a user gave them (link-preview). SERVER ONLY.
 *
 * Checking the hostname's spelling is not enough: a name can resolve to a
 * private address, an IP can be written in IPv4-mapped IPv6 form, and a public
 * URL can redirect to an internal one. So the check resolves the name and
 * judges every address it resolves to, and callers follow redirects by hand,
 * running the check again on each hop (`fetchPublic`).
 *
 * Known limit: the fetch resolves the name again after the check, so a DNS
 * answer that changes in between (rebinding) is not caught. Pinning the
 * address needs a custom dispatcher; the route only reads <head> metadata of
 * text/html, which keeps what such a request could return small.
 */
import { BlockList, isIP } from "node:net";
import { lookup } from "node:dns/promises";

const blocked = new BlockList();
for (const [net, prefix] of [
  ["0.0.0.0", 8], // "this network"
  ["10.0.0.0", 8],
  ["100.64.0.0", 10], // carrier-grade NAT
  ["127.0.0.0", 8],
  ["169.254.0.0", 16], // link-local, incl. cloud metadata
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4], // reserved, incl. broadcast
] as const) {
  blocked.addSubnet(net, prefix, "ipv4");
}
// No rule for IPv4-mapped IPv6 (::ffff:0:0/96): BlockList already judges a
// mapped address by the IPv4 rules above (::ffff:127.0.0.1 is refused), and a
// rule for the whole prefix would refuse every IPv4 address too.
for (const [net, prefix] of [
  ["::", 128],
  ["::1", 128],
  ["64:ff9b::", 96], // NAT64
  ["100::", 64],
  ["2001:db8::", 32],
  ["fc00::", 7], // unique local
  ["fe80::", 10], // link-local
  ["ff00::", 8], // multicast
] as const) {
  blocked.addSubnet(net, prefix, "ipv6");
}

/** True for an address on the public internet; false for anything private, local or reserved. */
export function isPublicIp(address: string): boolean {
  const ip = address.replace(/^\[|\]$/g, "").split("%")[0]!;
  const family = isIP(ip);
  if (family === 4) return !blocked.check(ip, "ipv4");
  if (family === 6) return !blocked.check(ip, "ipv6");
  return false;
}

/** True if the URL is http(s) and every address its host resolves to is public. */
export async function isPublicHttpUrl(url: URL): Promise<boolean> {
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!host || host === "localhost" || host.endsWith(".localhost")) return false;
  if (isIP(host)) return isPublicIp(host);
  try {
    const addresses = await lookup(host, { all: true, verbatim: true });
    return addresses.length > 0 && addresses.every((a) => isPublicIp(a.address));
  } catch {
    return false;
  }
}

/**
 * fetch() for a user-given URL: refuses a non-public destination, and follows
 * at most `maxRedirects` redirects by hand, re-checking each one. Returns null
 * when the URL (or any hop) is not public, or on too many redirects.
 */
export async function fetchPublic(
  rawUrl: string,
  init: Omit<RequestInit, "redirect"> = {},
  maxRedirects = 3
): Promise<Response | null> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  for (let hop = 0; hop <= maxRedirects; hop++) {
    if (!(await isPublicHttpUrl(url))) return null;
    const response = await fetch(url, { ...init, redirect: "manual" });
    if (response.status < 300 || response.status >= 400) return response;
    const location = response.headers.get("location");
    if (!location) return response;
    try {
      url = new URL(location, url);
    } catch {
      return null;
    }
  }
  return null;
}
