/**
 * Test script to verify MJML email rendering
 * Run with: npx tsx scripts/test-mjml-rendering.ts
 */

import mjml2html from "mjml";

// Simulate the processHtmlForEmail function
function processHtmlForEmail(content: string): string {
  let processed = content;

  // Add email-safe inline styles to links
  processed = processed.replace(
    /<a\s+([^>]*?)href=["']([^"']+)["']([^>]*?)>/gi,
    (match, before, href, after) => {
      const hasStyle = /style=/i.test(before + after);
      const linkStyle = 'color: #3b82f6; text-decoration: underline;';
      if (hasStyle) {
        return match.replace(/style=["']([^"']*)["']/i, `style="$1 ${linkStyle}"`);
      }
      return `<a ${before}href="${href}" style="${linkStyle}"${after}>`;
    }
  );

  // Style blockquotes
  processed = processed.replace(
    /<blockquote([^>]*)>/gi,
    '<blockquote$1 style="margin: 16px 0; padding: 12px 20px; border-left: 4px solid #3b82f6; background-color: #f3f4f6; color: #4b5563; font-style: italic;">'
  );

  // Style tables
  processed = processed.replace(
    /<table([^>]*)>/gi,
    '<table$1 style="width: 100%; border-collapse: collapse; margin: 16px 0;">'
  );
  processed = processed.replace(
    /<th([^>]*)>/gi,
    '<th$1 style="border: 1px solid #d1d5db; padding: 12px; background-color: #f9fafb; font-weight: 600; text-align: left;">'
  );
  processed = processed.replace(
    /<td([^>]*)>/gi,
    '<td$1 style="border: 1px solid #d1d5db; padding: 12px;">'
  );
  processed = processed.replace(
    /<tr([^>]*)>/gi,
    '<tr$1 style="border-bottom: 1px solid #e5e7eb;">'
  );

  // Style lists
  processed = processed.replace(/<ul([^>]*)>/gi, '<ul$1 style="margin: 16px 0; padding-left: 24px;">');
  processed = processed.replace(/<ol([^>]*)>/gi, '<ol$1 style="margin: 16px 0; padding-left: 24px;">');
  processed = processed.replace(/<li([^>]*)>/gi, '<li$1 style="margin: 8px 0;">');

  // Style headings
  processed = processed.replace(/<h1([^>]*)>/gi, '<h1$1 style="margin: 24px 0 16px 0; font-size: 28px; font-weight: 700; color: #111827; line-height: 1.3;">');
  processed = processed.replace(/<h2([^>]*)>/gi, '<h2$1 style="margin: 20px 0 12px 0; font-size: 24px; font-weight: 600; color: #1f2937; line-height: 1.3;">');
  processed = processed.replace(/<h3([^>]*)>/gi, '<h3$1 style="margin: 16px 0 8px 0; font-size: 20px; font-weight: 600; color: #374151; line-height: 1.4;">');

  // Style paragraphs
  processed = processed.replace(/<p([^>]*)>/gi, '<p$1 style="margin: 0 0 16px 0; line-height: 1.6;">');

  return processed;
}

// Simulate processContentForMjml
function processContentForMjml(content: string): string {
  let processed = processHtmlForEmail(content);

  // Convert <img> tags to MJML image markers using ||| separator
  processed = processed.replace(
    /<img([^>]*?)src=["']([^"']+)["']([^>]*?)\/?>/gi,
    (match, before, src, after) => {
      const altMatch = (before + after).match(/alt=["']([^"']*)["']/i);
      const alt = altMatch ? altMatch[1] : "";
      return `<!--MJML_IMAGE|||${src}|||${alt}-->`;
    }
  );

  return processed;
}

// Simulate contentToMjml
function contentToMjml(content: string): string {
  const parts = content.split(/<!--MJML_IMAGE\|\|\|([^|]*(?:\|(?!\|)[^|]*)*)\|\|\|([^>]*)-->/g);
  let mjmlContent = "";
  let textBuffer = "";

  const flushTextBuffer = () => {
    if (textBuffer.trim()) {
      mjmlContent += `
          <mj-section padding="0" background-color="#ffffff">
            <mj-column>
              <mj-text padding="16px 32px" color="#374151" font-size="16px" line-height="1.6">
                ${textBuffer.trim()}
              </mj-text>
            </mj-column>
          </mj-section>`;
      textBuffer = "";
    }
  };

  for (let i = 0; i < parts.length; i++) {
    if (i % 3 === 0) {
      const text = parts[i];
      if (text) {
        textBuffer += text;
      }
    } else if (i % 3 === 1) {
      flushTextBuffer();
      const src = parts[i];
      const alt = parts[i + 1] || "";
      mjmlContent += `
          <mj-section padding="16px 0" background-color="#ffffff">
            <mj-column>
              <mj-image src="${src}" alt="${alt}" padding="0 32px" fluid-on-mobile="true" align="center" />
            </mj-column>
          </mj-section>`;
      i++;
    }
  }

  flushTextBuffer();
  return mjmlContent;
}

// Test cases
const testCases = [
  {
    name: "Simple paragraph",
    content: "<p>Hello world!</p>",
  },
  {
    name: "Link",
    content: '<p>Click <a href="https://example.com">here</a> to visit.</p>',
  },
  {
    name: "Table",
    content: `
      <table>
        <tr><th>Name</th><th>Value</th></tr>
        <tr><td>Item 1</td><td>$100</td></tr>
        <tr><td>Item 2</td><td>$200</td></tr>
      </table>
    `,
  },
  {
    name: "Blockquote",
    content: "<blockquote>This is an important quote.</blockquote>",
  },
  {
    name: "Image with CID URL",
    content: '<p>See the image below:</p><img src="cid:image-abc123@hoamail" alt="Test Image" /><p>After the image.</p>',
  },
  {
    name: "Image with regular URL",
    content: '<p>See the image:</p><img src="https://example.com/image.jpg" alt="Example" /><p>End.</p>',
  },
  {
    name: "Complex content",
    content: `
      <h2>Newsletter Title</h2>
      <p>Welcome to our newsletter!</p>
      <blockquote>Important announcement here.</blockquote>
      <p>Check out our <a href="https://example.com">website</a>.</p>
      <table>
        <tr><th>Event</th><th>Date</th></tr>
        <tr><td>Meeting</td><td>Jan 15</td></tr>
      </table>
      <ul>
        <li>First item</li>
        <li>Second item</li>
      </ul>
    `,
  },
];

console.log("=".repeat(80));
console.log("MJML RENDERING TEST");
console.log("=".repeat(80));

for (const testCase of testCases) {
  console.log(`\n${"─".repeat(80)}`);
  console.log(`TEST: ${testCase.name}`);
  console.log(`${"─".repeat(80)}`);

  console.log("\n📥 INPUT:");
  console.log(testCase.content.trim());

  const processed = processContentForMjml(testCase.content);
  console.log("\n🔄 PROCESSED CONTENT:");
  console.log(processed.trim());

  const mjmlContent = contentToMjml(processed);
  console.log("\n📝 MJML CONTENT:");
  console.log(mjmlContent.trim());

  // Build full MJML template
  const fullMjml = `
<mjml>
  <mj-head>
    <mj-title>Test</mj-title>
    <mj-attributes>
      <mj-all font-family="Arial, sans-serif" />
      <mj-text font-size="16px" color="#374151" line-height="1.6" />
    </mj-attributes>
  </mj-head>
  <mj-body background-color="#f3f4f6">
    <mj-wrapper padding="24px 16px" background-color="#f3f4f6">
      ${mjmlContent}
    </mj-wrapper>
  </mj-body>
</mjml>`;

  try {
    const { html, errors } = mjml2html(fullMjml, {
      validationLevel: "soft",
      minify: false,
    });

    if (errors && errors.length > 0) {
      console.log("\n⚠️ MJML WARNINGS:");
      errors.forEach(err => console.log(`  - ${err.message}`));
    }

    console.log("\n✅ MJML COMPILED SUCCESSFULLY");
    console.log(`   HTML length: ${html.length} characters`);

    // Check if content is present in final HTML
    const hasContent = html.includes("374151"); // Check for our text color
    console.log(`   Content styling present: ${hasContent ? "Yes" : "No"}`);

  } catch (error: any) {
    console.log("\n❌ MJML COMPILATION FAILED:");
    console.log(`   ${error.message}`);
  }
}

console.log(`\n${"=".repeat(80)}`);
console.log("TEST COMPLETE");
console.log("=".repeat(80));
