import mjml2html from "mjml";
import { sendOrganizationEmail } from "../../utils/sendgrid";

interface TestBody {
  email: string;
}

/**
 * Send a simple test email to verify MJML rendering works
 * POST /api/email/test-simple-send with { email: "your@email.com" }
 */
export default defineEventHandler(async (event) => {
  await requireUserSession(event);
  const body = await readBody<TestBody>(event);

  if (!body.email) {
    throw createError({
      statusCode: 400,
      message: "Email address required",
    });
  }

  // Very simple MJML template - no wrapper, no nested sections
  const simpleMjml = `
<mjml>
  <mj-head>
    <mj-title>Simple MJML Test</mj-title>
    <mj-attributes>
      <mj-all font-family="Arial, Helvetica, sans-serif" />
    </mj-attributes>
  </mj-head>
  <mj-body background-color="#f4f4f4">
    <mj-section background-color="#ffffff" padding="20px">
      <mj-column>
        <mj-text font-size="24px" font-weight="bold" color="#333333" align="center">
          Simple MJML Test Email
        </mj-text>
      </mj-column>
    </mj-section>

    <mj-section background-color="#ffffff" padding="20px">
      <mj-column>
        <mj-text font-size="16px" color="#666666" line-height="1.6">
          <p>Hello,</p>
          <p>This is a simple test email to verify MJML rendering works correctly.</p>
          <h2 style="color: #333; margin-top: 20px;">This is an H2 Heading</h2>
          <p>Here is some paragraph text after the heading.</p>
          <blockquote style="border-left: 4px solid #3b82f6; padding-left: 16px; margin: 16px 0; color: #555; font-style: italic;">
            This is a blockquote to test quote styling.
          </blockquote>
          <p>And here is a <a href="https://example.com" style="color: #3b82f6; text-decoration: underline;">test link</a> to verify links work.</p>
          <ul style="margin: 16px 0; padding-left: 20px;">
            <li style="margin: 8px 0;">List item one</li>
            <li style="margin: 8px 0;">List item two</li>
            <li style="margin: 8px 0;">List item three</li>
          </ul>
        </mj-text>
      </mj-column>
    </mj-section>

    <mj-section background-color="#f9fafb" padding="20px">
      <mj-column>
        <mj-text font-size="14px" color="#666666" align="center">
          If you can see all the content above (heading, paragraph, blockquote, link, list),<br/>
          then MJML is rendering correctly!
        </mj-text>
        <mj-text font-size="12px" color="#999999" align="center" padding-top="10px">
          © 2025 Test Email
        </mj-text>
      </mj-column>
    </mj-section>
  </mj-body>
</mjml>`;

  console.log("[test-simple-send] Compiling MJML...");

  const { html, errors } = mjml2html(simpleMjml, {
    validationLevel: "soft",
    minify: false,
  });

  if (errors && errors.length > 0) {
    console.log("[test-simple-send] MJML errors:", JSON.stringify(errors, null, 2));
  }

  console.log(`[test-simple-send] Generated HTML length: ${html.length}`);
  console.log(`[test-simple-send] HTML preview: ${html.substring(0, 500)}...`);

  const text = `
Simple MJML Test Email

Hello,

This is a simple test email to verify MJML rendering works correctly.

This is an H2 Heading

Here is some paragraph text after the heading.

"This is a blockquote to test quote styling."

And here is a test link: https://example.com

- List item one
- List item two
- List item three

If you can see all the content above, then MJML is rendering correctly!

© 2025 Test Email
  `.trim();

  try {
    const result = await sendOrganizationEmail({
      to: body.email,
      toName: "Test Recipient",
      subject: "Simple MJML Test - Does This Render?",
      html,
      text,
      fromName: "MJML Test",
    });

    return {
      success: true,
      message: `Test email sent to ${body.email}`,
      messageId: result.messageId,
      htmlLength: html.length,
    };
  } catch (error: any) {
    console.error("[test-simple-send] Error:", error);
    throw createError({
      statusCode: 500,
      message: error.message || "Failed to send test email",
    });
  }
});
