/**
 * useStorageFormat — presentation helpers shared by the Files manager and the
 * universal file picker: human file sizes, file "kind" classification, and the
 * lucide icon + accent tint for each kind.
 */

export type FileKind =
  | "image"
  | "pdf"
  | "video"
  | "audio"
  | "doc"
  | "sheet"
  | "slides"
  | "archive"
  | "text"
  | "other";

export const useStorageFormat = () => {
  const formatFileSize = (bytes: number | null | undefined): string => {
    if (!bytes || bytes <= 0) return "—";
    const units = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    const value = bytes / Math.pow(1024, i);
    return `${value.toFixed(value >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
  };

  const fileKind = (type?: string | null, name?: string | null): FileKind => {
    const t = (type || "").toLowerCase();
    const ext = (name || "").split(".").pop()?.toLowerCase() || "";
    if (t.startsWith("image/")) return "image";
    if (t.startsWith("video/")) return "video";
    if (t.startsWith("audio/")) return "audio";
    if (t === "application/pdf" || ext === "pdf") return "pdf";
    if (["doc", "docx", "rtf", "odt"].includes(ext) || t.includes("word")) return "doc";
    if (["xls", "xlsx", "csv", "ods"].includes(ext) || t.includes("sheet") || t.includes("excel"))
      return "sheet";
    if (["ppt", "pptx", "key", "odp"].includes(ext) || t.includes("presentation"))
      return "slides";
    if (["zip", "rar", "7z", "tar", "gz"].includes(ext) || t.includes("zip") || t.includes("compressed"))
      return "archive";
    if (t.startsWith("text/") || ["txt", "md", "json", "xml"].includes(ext)) return "text";
    return "other";
  };

  const isImage = (type?: string | null) => (type || "").toLowerCase().startsWith("image/");

  /** lucide icon name (with the `lucide:` prefix) for a file kind. */
  const iconForKind = (kind: FileKind): string => {
    const map: Record<FileKind, string> = {
      image: "lucide:image",
      pdf: "lucide:file-text",
      video: "lucide:file-video",
      audio: "lucide:file-audio",
      doc: "lucide:file-text",
      sheet: "lucide:file-spreadsheet",
      slides: "lucide:file-sliders",
      archive: "lucide:file-archive",
      text: "lucide:file-code",
      other: "lucide:file",
    };
    return map[kind];
  };

  /** Tailwind text-color class giving each kind a recognizable tint. */
  const colorForKind = (kind: FileKind): string => {
    const map: Record<FileKind, string> = {
      image: "text-emerald-500",
      pdf: "text-rose-500",
      video: "text-fuchsia-500",
      audio: "text-amber-500",
      doc: "text-sky-500",
      sheet: "text-green-600",
      slides: "text-orange-500",
      archive: "text-yellow-600",
      text: "text-slate-500",
      other: "text-slate-400",
    };
    return map[kind];
  };

  const fileLabel = (file: { title?: string | null; filename_download?: string }) =>
    file.title || file.filename_download || "Untitled";

  return {
    formatFileSize,
    fileKind,
    isImage,
    iconForKind,
    colorForKind,
    fileLabel,
  };
};
