import { PortableText, type PortableTextBlock } from "@portabletext/react";

export function PostBody({ value }: { value: PortableTextBlock[] }) {
  return (
    <div className="prose max-w-none prose-headings:font-display">
      <PortableText value={value} />
    </div>
  );
}
