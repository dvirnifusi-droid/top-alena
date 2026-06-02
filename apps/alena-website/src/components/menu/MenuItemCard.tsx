import Image from "next/image";
import { urlFor } from "../../../sanity/lib/image";

export type MenuItemData = {
  _id: string;
  name: string;
  description?: string;
  price?: number;
  image?: unknown;
  tags?: string[];
};

export function MenuItemCard({ item }: { item: MenuItemData }) {
  return (
    <article className="overflow-hidden rounded-2xl bg-white shadow-sm">
      {item.image ? (
        <div className="relative aspect-[4/3]">
          <Image
            src={urlFor(item.image).width(800).url()}
            alt={item.name}
            fill
            sizes="(min-width:768px) 33vw, 100vw"
            className="object-cover"
          />
          {item.tags?.includes("חדש") ? (
            <span className="absolute right-3 top-3 rounded-full bg-lemon px-3 py-1 text-xs font-semibold">חדש</span>
          ) : null}
        </div>
      ) : null}
      <div className="p-4">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="font-display text-xl">{item.name}</h3>
          {item.price ? (
            <span className="font-numeric font-semibold text-terracotta">₪{item.price}</span>
          ) : null}
        </div>
        {item.description ? <p className="mt-1 text-sm text-charcoal/70">{item.description}</p> : null}
      </div>
    </article>
  );
}
