import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

export type BlogPostMeta = {
  title: string;
  description: string;
  date: string;
  slug: string;
  draft?: boolean;
};

export type BlogPost = BlogPostMeta & {
  body: string;
  html: string;
};

function resolveContentDir(): string {
  const candidates = [
    path.join(process.cwd(), "content", "blog"),
    path.join(process.cwd(), "apps/web/content", "blog"),
  ];
  for (const dir of candidates) {
    if (existsSync(dir)) return dir;
  }
  return candidates[0]!;
}

function parseFrontmatter(raw: string): {
  meta: Record<string, string>;
  body: string;
} {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) {
    return { meta: {}, body: raw.trim() };
  }

  const metaBlock = match[1] ?? "";
  const body = (match[2] ?? "").trim();
  const meta: Record<string, string> = {};
  for (const line of metaBlock.split(/\r?\n/)) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    meta[key] = value;
  }

  return { meta, body };
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function inlineMarkdown(text: string): string {
  let out = escapeHtml(text);
  out = out.replace(
    /\[([^\]]+)\]\((https?:\/\/[^)\s]+|\/[^)\s]*)\)/g,
    '<a href="$2">$1</a>',
  );
  out = out.replace(/`([^`]+)`/g, "<code>$1</code>");
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  return out;
}

/** Minimal Markdown → HTML for blog posts (headings, lists, paragraphs, links). */
export function markdownToHtml(md: string): string {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const parts: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i] ?? "";

    if (!line.trim()) {
      i += 1;
      continue;
    }

    if (line.startsWith("### ")) {
      parts.push(`<h3>${inlineMarkdown(line.slice(4))}</h3>`);
      i += 1;
      continue;
    }

    if (line.startsWith("## ")) {
      parts.push(`<h2>${inlineMarkdown(line.slice(3))}</h2>`);
      i += 1;
      continue;
    }

    if (line.startsWith("- ")) {
      const items: string[] = [];
      while (i < lines.length) {
        const itemLine = lines[i] ?? "";
        if (!itemLine.startsWith("- ")) break;
        items.push(`<li>${inlineMarkdown(itemLine.slice(2))}</li>`);
        i += 1;
      }
      parts.push(`<ul>${items.join("")}</ul>`);
      continue;
    }

    const para: string[] = [];
    while (i < lines.length) {
      const paraLine = lines[i] ?? "";
      if (!paraLine.trim() || paraLine.startsWith("#") || paraLine.startsWith("- ")) {
        break;
      }
      para.push(paraLine);
      i += 1;
    }
    parts.push(`<p>${inlineMarkdown(para.join(" "))}</p>`);
  }

  return parts.join("\n");
}

function toPost(
  meta: Record<string, string>,
  body: string,
  fileSlug: string,
): BlogPost | null {
  const title = meta.title?.trim();
  const description = meta.description?.trim();
  const date = meta.date?.trim();
  const slug = (meta.slug?.trim() || fileSlug).replace(/^\/+|\/+$/g, "");
  if (!title || !description || !date || !slug) return null;

  const draft =
    meta.draft === "true" || meta.draft === "yes" || meta.draft === "1";

  return {
    title,
    description,
    date,
    slug,
    draft,
    body,
    html: markdownToHtml(body),
  };
}

async function readPostFile(
  contentDir: string,
  fileName: string,
): Promise<BlogPost | null> {
  const raw = await readFile(path.join(contentDir, fileName), "utf8");
  const { meta, body } = parseFrontmatter(raw);
  const fileSlug = fileName.replace(/\.md$/i, "");
  return toPost(meta, body, fileSlug);
}

export async function listBlogPosts(options?: {
  includeDrafts?: boolean;
}): Promise<BlogPost[]> {
  const contentDir = resolveContentDir();
  let files: string[];
  try {
    files = (await readdir(contentDir)).filter((f) => f.endsWith(".md"));
  } catch {
    return [];
  }

  const posts: BlogPost[] = [];
  for (const file of files) {
    const post = await readPostFile(contentDir, file);
    if (!post) continue;
    if (post.draft && !options?.includeDrafts) continue;
    posts.push(post);
  }

  posts.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return posts;
}

export async function getBlogPost(slug: string): Promise<BlogPost | null> {
  const posts = await listBlogPosts({ includeDrafts: true });
  const post = posts.find((p) => p.slug === slug) ?? null;
  if (!post || post.draft) return null;
  return post;
}
