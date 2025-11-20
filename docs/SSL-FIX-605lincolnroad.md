# SSL Fix for 605lincolnroad.com

## Problem
**Error:** `ERR_SSL_VERSION_OR_CIPHER_MISMATCH` or `SSL handshake failure`

**Root Cause:** Vercel has updated their IP addresses, and the DNS is using outdated IP addresses that no longer provision SSL certificates properly.

## Solution

You have **two options** to fix this:

---

### ✅ Option 1: Use CNAME Setup (RECOMMENDED)

This is the easiest and most future-proof solution. Vercel will automatically update the IP addresses without you needing to change DNS records.

**Requirements:** Your DNS provider must support CNAME flattening at the apex domain (@).

**DNS Changes:**

1. **Remove these records:**
   - ❌ A record @ → 76.76.21.21
   - ❌ AAAA record @ → 2606:4700:3033::6815:48e

2. **Add this record:**
   - ✅ CNAME @ → cname.vercel-dns.com

3. **Keep this record:**
   - ✅ CNAME www → cname.vercel-dns.com

**Final Configuration:**
```
Type    Name    Value
CNAME   @       cname.vercel-dns.com
CNAME   www     cname.vercel-dns.com
```

**Providers that support CNAME flattening:**
- Cloudflare (CNAME flattening enabled by default)
- Netlify DNS
- DNS Made Easy
- NS1
- Route 53 (use Alias records instead)

---

### Option 2: Use New A Record (Alternative)

If your DNS provider does NOT support CNAME flattening at the apex, use Vercel's new A record IP address.

**DNS Changes:**

1. **Remove these records:**
   - ❌ AAAA record @ → 2606:4700:3033::6815:48e
   - ❌ A record @ → 76.76.21.21 (old IP)

2. **Add this record:**
   - ✅ A record @ → **216.198.79.1** (new Vercel IP)

3. **Keep this record:**
   - ✅ CNAME www → cname.vercel-dns.com

**Final Configuration:**
```
Type    Name    Value
A       @       216.198.79.1
CNAME   www     cname.vercel-dns.com
```

---

## After Making DNS Changes

1. **Wait for DNS propagation:** 5-30 minutes (up to 24 hours in rare cases)

2. **Verify DNS changes:**
   ```bash
   # Check A record
   nslookup 605lincolnroad.com

   # Should show 216.198.79.1 (Option 2) or Cloudflare IPs (Option 1)
   ```

3. **Check SSL provisioning in Vercel:**
   - Go to: https://vercel.com/dashboard
   - Navigate to: Project Settings → Domains
   - Look for: "605lincolnroad.com" should show "Valid Configuration" with SSL certificate

4. **Test the domain:**
   ```bash
   curl -I https://605lincolnroad.com
   ```
   Should return `HTTP/2 200` (not 403 or SSL error)

5. **Clear browser cache:**
   - Chrome/Edge: `Ctrl+Shift+Delete`
   - Safari: `Cmd+Option+E`
   - Firefox: `Ctrl+Shift+Delete`

---

## Vercel Domain Status

As of your last check, Vercel showed:

**Domain:** 605lincolnroad.com
- ✅ Verified: true
- ⚠️ Configuration: Invalid (wrong IP addresses)

**Vercel's Message:**
> "The DNS records at your provider must match the following records to verify and connect your domain to Vercel."

**What this means:**
- The domain ownership is verified (DNS records exist)
- BUT the IP addresses are outdated, so SSL can't provision
- Updating to the new IP or using CNAME will fix this

---

## Why This Happened

Vercel expanded their IP range and is deprecating the old IPs:

| Old (Deprecated)              | New (Current)           |
|-------------------------------|-------------------------|
| 76.76.21.21                   | 216.198.79.1            |
| 2606:4700:3033::6815:48e      | N/A (IPv6 not needed)   |
| A/AAAA setup                  | CNAME preferred         |

**Vercel's note:**
> "As part of a planned IP range expansion, you may notice new records above. The old records of cname.vercel-dns.com and 76.76.21.21 will continue to work but we recommend you use the new ones."

The old IPs might work for HTTP but are causing SSL certificate provisioning issues.

---

## Code Updates Made

Updated `server/api/vercel/add-domain.post.ts` to:
- Show new recommended IP: 216.198.79.1
- Mark AAAA record as deprecated
- Prioritize CNAME setup as recommended approach
- Maintain backward compatibility with old IPs

---

## Questions?

If you continue to see SSL errors after updating DNS and waiting 30 minutes:

1. Verify the DNS changes propagated:
   ```bash
   nslookup 605lincolnroad.com
   ```

2. Check Vercel domain status in dashboard

3. Try accessing via www:
   ```bash
   curl -I https://www.605lincolnroad.com
   ```

4. Clear browser cache and try incognito mode

5. Check if your DNS provider supports CNAME flattening (use Option 1 if yes)
