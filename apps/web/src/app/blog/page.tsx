import type { Metadata } from "next";
import Link from "next/link";
import { SiteChrome } from "@/app/site-chrome";
import { DocsBreadcrumbJsonLd } from "@/components/docs/docs-breadcrumb-json-ld";
import styles from "@/components/marketing/marketing.module.css";
import { listBlogPosts } from "@/lib/blog";

export const metadata: Metadata = {
  title: "Blog",
  description:
    "Notes on multi-agent arenas, agent spend caps, and fitness evidence — from the Coppergate team.",
  alternates: { canonical: "/blog" },
  openGraph: { url: "/blog" },
};

function formatDate(iso: string) {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export default async function BlogIndexPage() {
  const posts = await listBlogPosts();

  return (
    <SiteChrome>
      <DocsBreadcrumbJsonLd
        crumbs={[
          { name: "Home", path: "/" },
          { name: "Blog", path: "/blog" },
        ]}
      />
      <main className={styles.contentPage}>
        <p className={styles.pageEyebrow}>Blog</p>
        <h1 className={styles.pageTitle}>Blog</h1>
        <p className={styles.pageLede}>
          Notes on selection pressure, spend caps, and verified delivery — from
          the Coppergate team.
        </p>

        {posts.length === 0 ? (
          <p className={styles.pageLede}>
            No posts yet. Follow{" "}
            <a
              href="https://github.com/coppergateai/coppergate"
              target="_blank"
              rel="noreferrer"
            >
              GitHub
            </a>{" "}
            or the{" "}
            <Link href="/changelog">changelog</Link> for product updates.
          </p>
        ) : (
          <ul className={styles.docsList}>
            {posts.map((post) => (
              <li key={post.slug} className={styles.docsItem}>
                <Link href={`/blog/${post.slug}`}>{post.title}</Link>
                <p>
                  {formatDate(post.date)} — {post.description}
                </p>
              </li>
            ))}
          </ul>
        )}
      </main>
    </SiteChrome>
  );
}
