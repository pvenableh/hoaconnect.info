// server/api/landing/gallery.get.ts
//
// Public image list for an org's landing Gallery section (source: "folder").
// Resolves the org by slug, then returns the image files living in the chosen
// storage folder (and its descendants), scoped strictly to that org's subtree.
// No auth — the landing is public — but it only ever exposes image file ids,
// the same kind already public via the hero/listing imagery, and never escapes
// the org's own folder tree.
//
// Cached ~10 min per (slug, folder) to keep Directus reads cheap.
import { readItems, readFiles } from "@directus/sdk";
import { getDescendantFolderIds } from "~~/server/utils/org-storage";

interface GalleryImage {
  id: string;
  title: string | null;
  width: number | null;
  height: number | null;
}

export default defineCachedEventHandler(
  async (event): Promise<{ images: GalleryImage[] }> => {
    const { slug, folder } = getQuery(event);
    if (!slug) return { images: [] };

    const directus = getTypedDirectus();
    const orgs = await directus.request(
      readItems("hoa_organizations", {
        filter: { slug: { _eq: String(slug) } },
        fields: ["id", { folder: ["id"] }],
        limit: 1,
      })
    );
    const org = orgs?.[0] as any;
    if (!org) return { images: [] };

    const orgFolderId: string | null =
      (typeof org.folder === "object" ? org.folder?.id : org.folder) || null;
    if (!orgFolderId) return { images: [] };

    // The org subtree of allowed folder ids (tenant isolation boundary).
    const orgTree = await getDescendantFolderIds(orgFolderId);

    // A requested folder must live inside the org's own tree, else fall back to
    // the org root (never read another tenant's folder).
    const requested = folder ? String(folder) : "";
    const rootId = requested && orgTree.includes(requested) ? requested : orgFolderId;
    const folderIds =
      rootId === orgFolderId ? orgTree : await getDescendantFolderIds(rootId);

    const files = (await directus.request(
      readFiles({
        filter: {
          folder: { _in: folderIds },
          type: { _starts_with: "image/" },
        },
        fields: ["id", "title", "width", "height"],
        sort: ["-uploaded_on"],
        limit: 60,
      })
    )) as any[];

    return {
      images: files.map((f) => ({
        id: f.id,
        title: f.title ?? null,
        width: f.width ?? null,
        height: f.height ?? null,
      })),
    };
  },
  { maxAge: 600, getKey: (event) => `landing-gallery:${getQuery(event).slug}:${getQuery(event).folder || "root"}` }
);
