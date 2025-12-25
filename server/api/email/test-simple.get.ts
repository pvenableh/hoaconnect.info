import mjml2html from "mjml";

/**
 * Simple test endpoint that returns a minimal MJML-compiled email
 * Access via GET /api/email/test-simple to view in browser
 * This helps isolate if the issue is with MJML structure or content processing
 */
export default defineEventHandler(async (event) => {
  // Very simple MJML template
  const simpleMjml = `
<mjml>
  <mj-head>
    <mj-title>Simple Test</mj-title>
    <mj-attributes>
      <mj-all font-family="Arial, sans-serif" />
    </mj-attributes>
  </mj-head>
  <mj-body background-color="#ffffff">
    <mj-section background-color="#ffffff" padding="20px">
      <mj-column>
        <mj-text font-size="24px" font-weight="bold" color="#333333">
          This is a Heading
        </mj-text>
        <mj-text font-size="16px" color="#666666" padding-top="10px">
          This is paragraph text. If you can see this, basic MJML is working.
        </mj-text>
        <mj-text padding-top="20px">
          <blockquote style="border-left: 4px solid #3b82f6; padding-left: 16px; margin: 0; color: #666;">
            This is a blockquote
          </blockquote>
        </mj-text>
        <mj-text padding-top="20px">
          <a href="https://example.com" style="color: #3b82f6;">This is a link</a>
        </mj-text>
        <mj-divider border-color="#eeeeee" padding="20px 0" />
        <mj-text font-size="12px" color="#999999" align="center">
          Footer text - if you see this, the email rendered correctly.
        </mj-text>
      </mj-column>
    </mj-section>
  </mj-body>
</mjml>`;

  const { html, errors } = mjml2html(simpleMjml, {
    validationLevel: "soft",
    minify: false,
  });

  if (errors && errors.length > 0) {
    console.log("[test-simple] MJML errors:", errors);
  }

  console.log(`[test-simple] Generated HTML length: ${html.length}`);

  // Return as HTML to view in browser
  setResponseHeader(event, "Content-Type", "text/html; charset=utf-8");
  return html;
});
