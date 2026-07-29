// useEmailBuilder — client canvas state for the email block-builder (Phase 6).
// Authoring-only: it holds an ordered canvas of blocks, exposes mutations, and
// derives the assembled MJML. The host (EmailComposePage) writes that MJML into
// the email's content field so the EXISTING send/preview pipeline delivers it
// unchanged — no separate persistence. Ported from Earnest's useTemplateBuilder,
// trimmed to the compose-time subset (no template_blocks round-trips).

import { nanoid } from "nanoid";
import {
  assembleMjml,
  getDefaultVariables,
  parseVariablesSchema,
  type CanvasBlock,
  type AiGeneratedSection,
} from "#core/shared/email/blocks";
import type { HoaNewsletterBlock } from "#core/types/directus";

export function useEmailBuilder(orgId: Ref<string | null | undefined>) {
  const canvas = ref<CanvasBlock[]>([]);
  const library = ref<Record<string, HoaNewsletterBlock[]>>({});
  const loadingLibrary = ref(false);
  const backgroundColor = ref("#f4f4f4");

  /** The live assembled MJML for the current canvas. */
  const mjml = computed(() => assembleMjml(canvas.value, { backgroundColor: backgroundColor.value }));
  const isEmpty = computed(() => canvas.value.length === 0);

  function reindex() {
    canvas.value.forEach((b, i) => (b.sort = i));
  }

  async function loadLibrary() {
    if (!orgId.value) return;
    loadingLibrary.value = true;
    try {
      const res = await $fetch<{ library: Record<string, HoaNewsletterBlock[]> }>("/api/email/blocks", {
        query: { orgId: orgId.value },
      });
      library.value = res.library || {};
    } catch {
      library.value = {};
    } finally {
      loadingLibrary.value = false;
    }
  }

  function makeInstance(block: HoaNewsletterBlock, variables?: Record<string, any>): CanvasBlock {
    return {
      instanceId: nanoid(8),
      blockId: String(block.id),
      block,
      variables: variables ?? getDefaultVariables(block),
      sort: canvas.value.length,
    };
  }

  function addBlock(block: HoaNewsletterBlock, atIndex?: number) {
    const inst = makeInstance(block);
    const next = [...canvas.value];
    if (atIndex == null || atIndex >= next.length) next.push(inst);
    else next.splice(Math.max(0, atIndex), 0, inst);
    canvas.value = next;
    reindex();
  }

  function removeBlock(instanceId: string) {
    canvas.value = canvas.value.filter((b) => b.instanceId !== instanceId);
    reindex();
  }

  function duplicateBlock(instanceId: string) {
    const i = canvas.value.findIndex((b) => b.instanceId === instanceId);
    if (i === -1) return;
    const src = canvas.value[i]!;
    const copy: CanvasBlock = {
      instanceId: nanoid(8),
      blockId: src.blockId,
      block: src.block,
      variables: { ...src.variables },
      sort: 0,
    };
    const next = [...canvas.value];
    next.splice(i + 1, 0, copy);
    canvas.value = next;
    reindex();
  }

  function moveBlock(instanceId: string, direction: "up" | "down") {
    const i = canvas.value.findIndex((b) => b.instanceId === instanceId);
    if (i === -1) return;
    const j = direction === "up" ? i - 1 : i + 1;
    if (j < 0 || j >= canvas.value.length) return;
    const next = [...canvas.value];
    [next[i], next[j]] = [next[j]!, next[i]!];
    canvas.value = next;
    reindex();
  }

  /** Replace the canvas order wholesale (from a drag reorder). */
  function setOrder(blocks: CanvasBlock[]) {
    canvas.value = [...blocks];
    reindex();
  }

  function updateVariables(instanceId: string, vars: Record<string, any>) {
    const b = canvas.value.find((x) => x.instanceId === instanceId);
    if (!b) return;
    b.variables = { ...b.variables, ...vars };
    // Reassign the array so the assembled-MJML computed re-runs.
    canvas.value = [...canvas.value];
  }

  /** Fuzzy-match an AI variable key to a schema key (exact → includes). */
  function pickKey(schemaKeys: string[], aiKey: string): string | null {
    const k = aiKey.toLowerCase();
    return (
      schemaKeys.find((s) => s.toLowerCase() === k) ||
      schemaKeys.find((s) => s.toLowerCase().includes(k) || k.includes(s.toLowerCase())) ||
      null
    );
  }

  /** Drop AI-generated sections onto the canvas, matched to real library blocks. */
  function populateFromAI(sections: AiGeneratedSection[]) {
    const all = Object.values(library.value).flat();
    const byName = new Map(all.map((b) => [String(b.name).toLowerCase(), b]));
    const byCategory = new Map<string, HoaNewsletterBlock>();
    for (const b of all) if (b.category && !byCategory.has(b.category)) byCategory.set(b.category, b);

    const next: CanvasBlock[] = [];
    for (const s of sections) {
      const block =
        (s.blockName && byName.get(String(s.blockName).toLowerCase())) ||
        (s.blockCategory && byCategory.get(String(s.blockCategory))) ||
        null;
      if (!block) continue;
      const variables = getDefaultVariables(block);
      const schemaKeys = parseVariablesSchema(block.variables_schema, block.mjml_source).map((d) => d.key);
      for (const [aiKey, val] of Object.entries(s.variables || {})) {
        const key = pickKey(schemaKeys, aiKey);
        if (key) variables[key] = val;
      }
      next.push({ instanceId: nanoid(8), blockId: String(block.id), block, variables, sort: next.length });
    }
    if (next.length) canvas.value = next;
  }

  function clear() {
    canvas.value = [];
  }

  return {
    canvas,
    library,
    loadingLibrary,
    backgroundColor,
    mjml,
    isEmpty,
    loadLibrary,
    addBlock,
    removeBlock,
    duplicateBlock,
    moveBlock,
    setOrder,
    updateVariables,
    populateFromAI,
    clear,
  };
}
