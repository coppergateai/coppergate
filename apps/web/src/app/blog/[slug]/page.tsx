import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteChrome } from "@/app/site-chrome";
import { DocsBreadcrumbJsonLd } from "@/components/docs/docs-breadcrumb-json-ld";
import { JsonLdScript } from "@/components/seo/json-ld-script";
import styles from "@/components/marketing/marketing.module.css";
import { getBlogPost, listBlogPosts } from "@/lib/blog";
import { absoluteUrl, publicPageMetadata } from "@/lib/seo";
import { getSiteUrl } from "@/lib/site-url";

type PageProps = { params: Promise<{ slug: string }> };

export async function generateStaticParams() {
  const posts = await listBlogPosts();
  return posts.map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const post = await getBlogPost(slug);
  if (!post) {
    return { title: "Blog" };
  }

  const path = `/blog/${post.slug}`;
  return publicPageMetadata({
    title: post.title,
    description: post.description,
    path,
    openGraph: {
      type: "article",
      publishedTime: `${post.date}T00:00:00.000Z`,
      modifiedTime: `${post.date}T00:00:00.000Z`,
    },
  });
}

function formatDate(iso: string) {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export default async function BlogPostPage({ params }: PageProps) {
  const { slug } = await params;
  const post = await getBlogPost(slug);
  if (!post) notFound();

  const siteUrl = getSiteUrl();
  const path = `/blog/${post.slug}`;
  const related = (await listBlogPosts())
    .filter((p) => p.slug !== post.slug)
    .slice(0, 3);
  const ogImage = absoluteUrl("/opengraph-image");

  const articleLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    description: post.description,
    datePublished: `${post.date}T00:00:00.000Z`,
    dateModified: `${post.date}T00:00:00.000Z`,
    mainEntityOfPage: `${siteUrl}${path}`,
    image: [ogImage],
    author: {
      "@type": "Organization",
      name: "Coppergate",
      url: siteUrl,
    },
    publisher: {
      "@type": "Organization",
      name: "Coppergate",
      url: siteUrl,
      logo: {
        "@type": "ImageObject",
        url: `${siteUrl}/icon-512.png`,
      },
    },
    inLanguage: "en",
  };

  return (
    <SiteChrome>
      <DocsBreadcrumbJsonLd
        crumbs={[
          { name: "Home", path: "/" },
          { name: "Blog", path: "/blog" },
          { name: post.title, path },
        ]}
      />
      <JsonLdScript data={articleLd} />
      <article className={styles.contentPage}>
        <Link className={styles.backLink} href="/blog">
          ← Blog
        </Link>
        <p className={styles.pageEyebrow}>{formatDate(post.date)}</p>
        <h1 className={styles.pageTitle}>{post.title}</h1>
        <p className={styles.pageLede}>{post.description}</p>
        <div
          className={styles.prose}
          dangerouslySetInnerHTML={{ __html: post.html }}
        />

        {related.length > 0 ? (
          <section className={styles.prose} aria-labelledby="related-posts">
            <h2 id="related-posts">Related posts</h2>
            <ul>
              {related.map((item) => (
                <li key={item.slug}>
                  <Link href={`/blog/${item.slug}`}>{item.title}</Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

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
      </article>
    </SiteChrome>
  );
}
