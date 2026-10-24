import { JsonLdScript } from "@/components/seo/json-ld-script";
import { getSiteUrl } from "@/lib/site-url";

export type DocsCrumb = {
  name: string;
  path: string;
};

export function DocsBreadcrumbJsonLd({ crumbs }: { crumbs: DocsCrumb[] }) {
  const siteUrl = getSiteUrl();
  const data = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((crumb, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: crumb.name,
      item: `${siteUrl}${crumb.path}`,
    })),
  };

  return <JsonLdScript data={data} />;
}
