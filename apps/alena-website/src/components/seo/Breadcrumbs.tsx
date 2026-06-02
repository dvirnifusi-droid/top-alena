import Link from "next/link";
import { JsonLd } from "./JsonLd";
import { breadcrumbSchema } from "./schemas";

export function Breadcrumbs({ items }: { items: { name: string; url: string }[] }) {
  return (
    <>
      <nav className="text-xs text-charcoal/60" aria-label="breadcrumb">
        {items.map((it, i) => (
          <span key={it.url}>
            <Link href={it.url}>{it.name}</Link>
            {i < items.length - 1 ? " / " : ""}
          </span>
        ))}
      </nav>
      <JsonLd data={breadcrumbSchema(items)} />
    </>
  );
}
