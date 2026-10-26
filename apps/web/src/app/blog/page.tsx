import type { Metadata } from "next";
import Link from "next/link";
import { SiteChrome } from "@/app/site-chrome";
import { DocsBreadcrumbJsonLd } from "@/components/docs/docs-breadcrumb-json-ld";
import { JsonLdScript } from "@/components/seo/json-ld-script";
import styles from "@/components/marketing/marketing.module.css";
import { listBlogPosts } from "@/lib/blog";
import { publicPageMetadata } from "@/lib/seo";
import { getSiteUrl } from "@/lib/site-url";

export const metadata: Metadata = publicPageMetadata({
  title: "Blog",
  description:
    "Notes on Open Program Runtime, multi-agent arenas, spend caps, and fitness evidence — from the Coppergate team.",
  path: "/blog",
});

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
  const siteUrl = getSiteUrl();

  const collectionLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "Coppergate Blog",
    description:
      "Notes on multi-agent arenas, agent spend caps, and fitness evidence.",
    url: `${siteUrl}/blog`,
    isPartOf: { "@type": "WebSite", name: "Coppergate", url: siteUrl },
    mainEntity: {
      "@type": "ItemList",
      itemListElement: posts.map((post, index) => ({
        "@type": "ListItem",
        position: index + 1,
        url: `${siteUrl}/blog/${post.slug}`,
        name: post.title,
      })),
    },
  };

  return (
    <SiteChrome>
      <DocsBreadcrumbJsonLd
        crumbs={[
          { name: "Home", path: "/" },
          { name: "Blog", path: "/blog" },
        ]}
      />
      <JsonLdScript data={collectionLd} />
      <div className={styles.contentPage}>
        <p className={styles.pageEyebrow}>Blog</p>
        <h1 className={styles.pageTitle}>Blog</h1>
        <p className={styles.pageLede}>
          Notes on Open Program Runtime, Contracted Autonomy, and Ship Receipts
          — from the Coppergate team.
        </p>

        {posts.length === 0 ? (
          <p className={styles.blogEmpty}>
            No posts yet. Follow{" "}
            <a
              href="https://github.com/coppergateai/coppergate"
              target="_blank"
              rel="noreferrer"
            >
              GitHub
            </a>{" "}
            or the <Link href="/changelog">changelog</Link> for product updates.
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

        <div className={styles.docsCtaRow}>
          <a
            className={styles.btnHeroPrimary}
            href="https://github.com/coppergateai/coppergate/blob/main/docs/SELF_HOST.md"
            target="_blank"
            rel="noreferrer"
          >
            Self-host guide
          </a>
          <Link
            className={styles.btnSecondary}
            href="/docs/open-program-runtime"
          >
            Open Program Runtime
          </Link>
          <Link className={styles.btnSecondary} href="/login">
            Try hosted
          </Link>
        </div>
      </div>
    </SiteChrome>
  );
}
