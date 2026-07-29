// POST /api/email/assemble — assemble builder canvas blocks into one MJML doc.
// Substitutes each block's design-time {{{key}}} variables, wraps the result in
// an <mjml> skeleton, and validates it by compiling through buildRawEmailHtml —
// the SAME util send.post.ts uses, so a valid assembly here delivers unchanged.
// Per-recipient {{merge_field}} tokens are left intact for the send path to
// apply later (the two variable layers compose). Auth-gated to comms actors.
//
// docs/plan-earnest-parity-upgrade.md, Phase 6.

interface CanvasBlockInput {
  block_mjml?: string;
  instance_variables?: Record<string, any>;
}

/** Replace {{{key}}} design-time slots; drop any that remain so MJML won't choke. */
function substitute(source: string, vars: Record<string, any>): string {
  let out = source;
  for (const [k, v] of Object.entries(vars || {})) {
    out = out.split(`{{{${k}}}}`).join(String(v ?? ""));
  }
  return out.replace(/\{\{\{[^}]+\}\}\}/g, "");
}

export default defineEventHandler(async (event) => {
  await requireUserSession(event);
  const body = await readBody(event);
  const orgId = String(body?.orgId || "").trim();
  if (!orgId) throw createError({ statusCode: 400, message: "orgId is required" });
  await requireOrgComposeAccess(event, orgId);

  const blocks: CanvasBlockInput[] = Array.isArray(body?.canvas_blocks) ? body.canvas_blocks : [];
  const bg = String(body?.background_color || "#f4f4f4");

  const rendered = blocks
    .map((b) => substitute(String(b.block_mjml || ""), b.instance_variables || {}))
    .filter((s) => s.trim())
    .join("\n");

  const assembled = [
    "<mjml>",
    '<mj-head><mj-attributes><mj-all font-family="Helvetica, Arial, sans-serif" /></mj-attributes></mj-head>',
    `<mj-body background-color="${bg}">`,
    rendered,
    "</mj-body>",
    "</mjml>",
  ].join("\n");

  // Validate by compiling through the send path's own renderer.
  let isValid = true;
  let error: string | null = null;
  try {
    const html = buildRawEmailHtml(assembled);
    isValid = !!html && /<html|<body|<table/i.test(html);
    if (!isValid) error = "Assembled MJML produced no HTML";
  } catch (e: any) {
    isValid = false;
    error = e?.message || "MJML compile failed";
  }

  return { mjml_source: assembled, is_valid: isValid, error };
});
