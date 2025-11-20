#!/usr/bin/env tsx
// scripts/add-www-domain.ts
// Adds www.605lincolnroad.com to Vercel project

import { config } from 'dotenv';

config();

const VERCEL_API_TOKEN = process.env.VERCEL_API_TOKEN;
const VERCEL_PROJECT_ID = process.env.VERCEL_PROJECT_ID;
const VERCEL_TEAM_ID = process.env.VERCEL_TEAM_ID;
const WWW_DOMAIN = 'www.605lincolnroad.com';

async function addDomain(domain: string) {
  const url = VERCEL_TEAM_ID
    ? `https://api.vercel.com/v10/projects/${VERCEL_PROJECT_ID}/domains?teamId=${VERCEL_TEAM_ID}`
    : `https://api.vercel.com/v10/projects/${VERCEL_PROJECT_ID}/domains`;

  console.log(`\n🔧 Adding ${domain} to Vercel project...`);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${VERCEL_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: domain }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || `HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();

    console.log('\n✅ Successfully added domain to Vercel!');
    console.log('\nDomain Details:');
    console.log(`   Name: ${data.name}`);
    console.log(`   Verified: ${data.verified ? '✅' : '❌ (verify DNS configuration)'}`);
    console.log(`   Created: ${new Date(data.createdAt).toLocaleString()}`);

    if (!data.verified) {
      console.log('\n⚠️  Domain not verified yet. Your DNS configuration:');
      console.log('   CNAME www → cname.vercel-dns.com ✅');
      console.log('\n   DNS propagation can take 5-10 minutes.');
      console.log('   SSL certificate will be provisioned after verification.');
    }

    return data;
  } catch (error: any) {
    console.error('\n❌ Failed to add domain:', error.message);

    if (error.message.includes('already exists')) {
      console.log('\n💡 This domain is already added to Vercel.');
      console.log('   The SSL issue might be due to:');
      console.log('   1. Certificate still provisioning (wait 5-30 minutes)');
      console.log('   2. DNS propagation delay');
      console.log('   3. Need to use CNAME setup instead of A/AAAA records');
    }

    throw error;
  }
}

async function main() {
  if (!VERCEL_API_TOKEN || !VERCEL_PROJECT_ID) {
    console.error('❌ Missing required environment variables:');
    console.error('   - VERCEL_API_TOKEN:', VERCEL_API_TOKEN ? '✅' : '❌');
    console.error('   - VERCEL_PROJECT_ID:', VERCEL_PROJECT_ID ? '✅' : '❌');
    process.exit(1);
  }

  await addDomain(WWW_DOMAIN);
}

main().catch((error) => {
  console.error('\n💥 Script failed:', error.message);
  process.exit(1);
});
