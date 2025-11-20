#!/usr/bin/env tsx
// scripts/diagnose-domain.ts
// Diagnoses domain and SSL configuration for 605lincolnroad.com

import { config } from 'dotenv';

config();

const VERCEL_API_TOKEN = process.env.VERCEL_API_TOKEN;
const VERCEL_PROJECT_ID = process.env.VERCEL_PROJECT_ID;
const VERCEL_TEAM_ID = process.env.VERCEL_TEAM_ID;
const DOMAIN = '605lincolnroad.com';
const WWW_DOMAIN = 'www.605lincolnroad.com';

async function checkDomain(domain: string) {
  const url = VERCEL_TEAM_ID
    ? `https://api.vercel.com/v9/projects/${VERCEL_PROJECT_ID}/domains/${domain}?teamId=${VERCEL_TEAM_ID}`
    : `https://api.vercel.com/v9/projects/${VERCEL_PROJECT_ID}/domains/${domain}`;

  try {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${VERCEL_API_TOKEN}`,
      },
    });

    if (!response.ok) {
      return { exists: false, status: response.status };
    }

    const data = await response.json();
    return { exists: true, data };
  } catch (error) {
    return { exists: false, error };
  }
}

async function listAllDomains() {
  const url = VERCEL_TEAM_ID
    ? `https://api.vercel.com/v9/projects/${VERCEL_PROJECT_ID}/domains?teamId=${VERCEL_TEAM_ID}`
    : `https://api.vercel.com/v9/projects/${VERCEL_PROJECT_ID}/domains`;

  try {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${VERCEL_API_TOKEN}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to list domains: ${response.statusText}`);
    }

    const data = await response.json();
    return data.domains || [];
  } catch (error) {
    console.error('Error listing domains:', error);
    return [];
  }
}

async function addDomain(domain: string) {
  const url = VERCEL_TEAM_ID
    ? `https://api.vercel.com/v10/projects/${VERCEL_PROJECT_ID}/domains?teamId=${VERCEL_TEAM_ID}`
    : `https://api.vercel.com/v10/projects/${VERCEL_PROJECT_ID}/domains`;

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
      throw new Error(error.error?.message || 'Failed to add domain');
    }

    const data = await response.json();
    return { success: true, data };
  } catch (error) {
    return { success: false, error };
  }
}

async function main() {
  console.log('🔍 Diagnosing domain configuration for 605lincolnroad.com\n');

  // Check environment variables
  if (!VERCEL_API_TOKEN || !VERCEL_PROJECT_ID) {
    console.error('❌ Missing required environment variables:');
    console.error('   - VERCEL_API_TOKEN:', VERCEL_API_TOKEN ? '✅ Set' : '❌ Missing');
    console.error('   - VERCEL_PROJECT_ID:', VERCEL_PROJECT_ID ? '✅ Set' : '❌ Missing');
    process.exit(1);
  }

  console.log('✅ Environment variables configured\n');

  // List all domains
  console.log('📋 Listing all domains in Vercel project:\n');
  const allDomains = await listAllDomains();

  if (allDomains.length === 0) {
    console.log('   No domains found in project');
  } else {
    allDomains.forEach((domain: any) => {
      console.log(`   - ${domain.name}`);
      console.log(`     Verified: ${domain.verified ? '✅' : '❌'}`);
      console.log(`     Created: ${new Date(domain.createdAt).toLocaleString()}`);
      console.log('');
    });
  }

  // Check apex domain
  console.log('\n🔍 Checking apex domain (605lincolnroad.com):\n');
  const apexCheck = await checkDomain(DOMAIN);

  if (apexCheck.exists) {
    console.log('   ✅ Domain exists in Vercel');
    console.log(`   Verified: ${apexCheck.data.verified ? '✅' : '❌'}`);
    console.log(`   Created: ${new Date(apexCheck.data.createdAt).toLocaleString()}`);
    console.log(`   Updated: ${new Date(apexCheck.data.updatedAt).toLocaleString()}`);
  } else {
    console.log('   ❌ Domain NOT found in Vercel');
    console.log(`   Status: ${apexCheck.status || 'Unknown'}`);
  }

  // Check www subdomain
  console.log('\n🔍 Checking www subdomain (www.605lincolnroad.com):\n');
  const wwwCheck = await checkDomain(WWW_DOMAIN);

  if (wwwCheck.exists) {
    console.log('   ✅ WWW subdomain exists in Vercel');
    console.log(`   Verified: ${wwwCheck.data.verified ? '✅' : '❌'}`);
    console.log(`   Created: ${new Date(wwwCheck.data.createdAt).toLocaleString()}`);
  } else {
    console.log('   ❌ WWW subdomain NOT found in Vercel');
    console.log('   ⚠️  This is likely causing the SSL issue!');
    console.log('\n   You have a CNAME record for www → cname.vercel-dns.com');
    console.log('   but www.605lincolnroad.com is not added to Vercel.\n');

    // Offer to add www domain
    console.log('Would you like to add www.605lincolnroad.com to Vercel? (y/n)');

    // For automated runs, uncomment this to auto-add:
    // console.log('\n🔧 Adding www.605lincolnroad.com to Vercel...');
    // const addResult = await addDomain(WWW_DOMAIN);
    // if (addResult.success) {
    //   console.log('   ✅ Successfully added www subdomain');
    // } else {
    //   console.log('   ❌ Failed to add www subdomain:', addResult.error);
    // }
  }

  // Recommendations
  console.log('\n📝 Recommendations:\n');

  if (!wwwCheck.exists) {
    console.log('1. Add www.605lincolnroad.com to Vercel:');
    console.log('   - Run: node scripts/add-www-domain.ts');
    console.log('   - Or manually add in Vercel dashboard\n');
  }

  console.log('2. Wait 5-10 minutes for SSL certificate to provision');
  console.log('   - Vercel automatically provisions SSL certificates');
  console.log('   - This can take up to 24 hours in some cases\n');

  console.log('3. Alternative: Use CNAME setup instead of A/AAAA records');
  console.log('   - If your DNS provider supports CNAME flattening at apex');
  console.log('   - Change A/AAAA records to: CNAME @ cname.vercel-dns.com\n');

  console.log('4. Verify SSL certificate status in Vercel dashboard:');
  console.log('   - https://vercel.com/dashboard');
  console.log('   - Project Settings → Domains');
  console.log('   - Check if SSL shows as "Provisioned"\n');
}

main().catch(console.error);
