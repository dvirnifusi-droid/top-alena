import Image from "next/image";
import { urlFor } from "../../../sanity/lib/image";

type EventPackage = {
  _id: string;
  name: string;
  description?: string;
  minGuests?: number;
  maxGuests?: number;
  pricePerHead?: number;
  image?: unknown;
};

export function EventPackages({ packages }: { packages: EventPackage[] }) {
  if (!packages?.length) return null;
  return (
    <div className="grid gap-6 md:grid-cols-3">
      {packages.map((p) => (
        <article key={p._id} className="overflow-hidden rounded-2xl bg-white shadow-sm">
          {p.image ? (
            <div className="relative aspect-[4/3]">
              <Image src={urlFor(p.image).width(800).url()} alt={p.name} fill sizes="33vw" className="object-cover" />
            </div>
          ) : null}
          <div className="p-4">
            <h3 className="font-display text-xl">{p.name}</h3>
            {p.description ? <p className="mt-2 text-sm text-charcoal/70">{p.description}</p> : null}
            <div className="mt-3 text-sm">
              {p.minGuests}-{p.maxGuests} אורחים{p.pricePerHead ? ` · ₪${p.pricePerHead} לאדם` : ""}
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}
