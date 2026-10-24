type Props = {
  data: Record<string, unknown> | Record<string, unknown>[];
};

export function JsonLdScript({ data }: Props) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
